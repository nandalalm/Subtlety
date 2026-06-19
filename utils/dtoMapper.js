class DtoMapper {
  toUserDto(user) {
    if (!user) return null;
    const userObj = user.toObject ? user.toObject() : user;

    return {
      _id: userObj._id,
      firstname: userObj.firstname,
      lastname: userObj.lastname,
      email: userObj.email,
      phoneNo: userObj.phoneNo,
      isBlocked: userObj.isBlocked,
      referralCreditsClaimed: userObj.referralCreditsClaimed,
      wishlisted: userObj.wishlisted || [],
      usedCoupons: userObj.usedCoupons || [],
    };
  }

  toAdminDto(admin) {
    if (!admin) return null;
    const adminObj = admin.toObject ? admin.toObject() : admin;

    return {
      _id: adminObj._id,
      email: adminObj.email,
      name: adminObj.name,
    };
  }
}

export default new DtoMapper();
